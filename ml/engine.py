import json
import os
import sys
from datetime import timedelta
from pathlib import Path
import sys

import joblib
import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ml.transformers import IqrClipper


TARGETS = {"DMY": "dmy", "MF": "mf", "FC": "fc", "PC": "pc"}
FEATURES = [
    "dim", "dmy", "mf", "fc", "pc", "mt", "rt",
    "tmax", "tmin", "rhmax", "rhmin", "vp", "vpd", "thiMax", "thiMin",
    "dayOfYear", "dmyRolling7", "mfRolling7",
]


def build_features(rows):
    frame = pd.DataFrame(rows)
    if frame.empty:
        raise ValueError("No observations were provided.")
    frame["date"] = pd.to_datetime(frame["date"], errors="coerce")
    frame = frame.dropna(subset=["date", "cowId"]).sort_values(["date", "cowId"]).reset_index(drop=True)
    for column in FEATURES:
        if column not in frame:
            frame[column] = np.nan
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    frame["dayOfYear"] = frame["date"].dt.day_of_year
    frame["dmyRolling7"] = frame.groupby("cowId")["dmy"].transform(
        lambda values: values.shift(1).rolling(7, min_periods=1).mean()
    )
    frame["mfRolling7"] = frame.groupby("cowId")["mf"].transform(
        lambda values: values.shift(1).rolling(7, min_periods=1).mean()
    )
    return frame


def create_model():
    return Pipeline(
        steps=[
            ("outlier_clipping", IqrClipper()),
            ("imputation", SimpleImputer(strategy="median", keep_empty_features=True)),
            ("normalization", StandardScaler()),
            ("xgboost", XGBRegressor(
                objective="reg:squarederror",
                n_estimators=120,
                max_depth=4,
                learning_rate=0.05,
                subsample=0.9,
                colsample_bytree=0.9,
                n_jobs=1,
                random_state=42,
            )),
        ]
    )


def score_predictions(actual, predicted):
    actual = np.asarray(actual, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    mae = float(mean_absolute_error(actual, predicted))
    rmse = float(np.sqrt(mean_squared_error(actual, predicted)))
    r_squared = float(r2_score(actual, predicted)) if len(actual) > 1 else 0.0
    denominator = np.maximum(np.abs(actual), 1e-8)
    accuracy = max(0.0, float((1 - np.mean(np.abs(actual - predicted) / denominator)) * 100))
    return {
        "mae": mae,
        "rmse": rmse,
        "r2": r_squared,
        "accuracyPercent": accuracy,
        "meetsTarget": accuracy > 80 and r_squared > 0.90,
    }


def train(rows, run_id):
    frame = build_features(rows)
    features = frame[FEATURES]
    directory = Path(os.environ["MILKSENSE_MODEL_DIR"]) / run_id
    directory.mkdir(parents=True, exist_ok=True)
    metrics = {}
    feature_importance = {}
    models = {}
    splitter = TimeSeriesSplit(n_splits=5)

    for label, target in TARGETS.items():
        target_frame = frame[["cowId", "date", target]].copy()
        target_frame["nextValue"] = target_frame.groupby("cowId")[target].shift(-1)
        target_frame["nextDate"] = target_frame.groupby("cowId")["date"].shift(-1)
        valid = target_frame["nextValue"].notna() & (
            target_frame["nextDate"] - target_frame["date"] == pd.Timedelta(days=1)
        )
        indexes = np.flatnonzero(valid.to_numpy())
        sample_dates = target_frame.loc[valid, "nextDate"].to_numpy()
        unique_dates = np.sort(pd.unique(sample_dates))
        if len(indexes) < 6 or len(unique_dates) < 6:
            raise ValueError(f"At least six consecutive daily training dates are required for {label}.")
        x_values = features.iloc[indexes]
        y_values = target_frame.loc[valid, "nextValue"].astype(float).to_numpy()
        predicted = np.full(len(y_values), np.nan)

        for train_date_indexes, validation_date_indexes in splitter.split(unique_dates):
            train_dates = unique_dates[train_date_indexes]
            validation_dates = unique_dates[validation_date_indexes]
            train_indexes = np.flatnonzero(np.isin(sample_dates, train_dates))
            validation_indexes = np.flatnonzero(np.isin(sample_dates, validation_dates))
            model = create_model()
            model.fit(x_values.iloc[train_indexes], y_values[train_indexes])
            predicted[validation_indexes] = model.predict(x_values.iloc[validation_indexes])
        scored = np.isfinite(predicted)
        metrics[label] = score_predictions(y_values[scored], predicted[scored])

        final_model = create_model()
        final_model.fit(x_values, y_values)
        models[label] = final_model
        joblib.dump(final_model, directory / f"{label.lower()}.joblib")
        importance = final_model.named_steps["xgboost"].feature_importances_
        feature_importance[label] = [
            {"feature": feature, "importance": float(value)}
            for feature, value in sorted(zip(FEATURES, importance), key=lambda item: item[1], reverse=True)
        ]

    forecasts = []
    for cow_id, cow_rows in frame.groupby("cowId", sort=True):
        history = cow_rows.sort_values("date").to_dict("records")
        if not history:
            continue
        latest = history[-1].copy()
        for offset in range(1, 29):
            target_date = latest["date"] + timedelta(days=1)
            input_row = latest.copy()
            input_row["dayOfYear"] = target_date.day_of_year
            input_row["dmyRolling7"] = float(np.mean([row["dmy"] for row in history[-7:]]))
            input_row["mfRolling7"] = float(np.mean([row["mf"] for row in history[-7:]]))
            x_row = pd.DataFrame([{feature: input_row.get(feature) for feature in FEATURES}])
            values = {label: max(0.0, float(model.predict(x_row)[0])) for label, model in models.items()}
            forecasts.append({
                "cowId": str(cow_id),
                "date": target_date.date().isoformat(),
                "dmy": values["DMY"],
                "mf": values["MF"],
                "fc": values["FC"],
                "pc": values["PC"],
            })
            latest = {**input_row, "date": target_date, **{column: values[label] for label, column in TARGETS.items()}}
            latest["dim"] = (latest.get("dim") or 0) + 1
            history.append(latest)

    return {
        "metrics": metrics,
        "featureImportance": feature_importance,
        "forecasts": forecasts,
    }


def main():
    request = json.load(sys.stdin)
    if request.get("action") != "train":
        raise ValueError("Unsupported ML action.")
    result = train(request.get("rows", []), request.get("runId", "latest"))
    sys.stdout.write(json.dumps(result, allow_nan=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
