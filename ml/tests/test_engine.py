import os
import math
import tempfile
import unittest
from datetime import date, timedelta
from unittest.mock import patch

from ml.engine import FEATURES, build_features, train


def sample_rows(days=45):
    start = date(2026, 1, 1)
    return [
        {
            "cowId": "42",
            "date": (start + timedelta(days=offset)).isoformat(),
            "dim": 80 + offset,
            "dmy": 30 + offset * 0.1,
            "mf": 2.8 + offset * 0.01,
            "fc": 4 + offset * 0.002,
            "pc": 3.2 + offset * 0.001,
            "mt": 38,
            "rt": 400,
            "tmax": 24,
            "tmin": 14,
            "rhmax": 70,
            "rhmin": 45,
            "vp": 10,
            "vpd": 6,
            "thiMax": 68,
            "thiMin": 60,
        }
        for offset in range(days)
    ]


class ModelEngineTests(unittest.TestCase):
    def test_feature_pipeline_adds_day_of_year_and_prior_rolling_means(self):
        frame = build_features(sample_rows(3))

        self.assertEqual(frame.loc[0, "dayOfYear"], 1)
        self.assertTrue(math.isnan(frame.loc[0, "dmyRolling7"]))
        self.assertAlmostEqual(frame.loc[1, "dmyRolling7"], 30.0)
        self.assertAlmostEqual(frame.loc[2, "dmyRolling7"], 30.05)
        self.assertEqual(len(FEATURES), 18)

    def test_training_returns_metrics_feature_importance_and_28_day_forecasts(self):
        rows = sample_rows()
        for row in rows:
            for field in ("mt", "rt", "tmax", "tmin", "rhmax", "rhmin", "vp", "vpd", "thiMax", "thiMin"):
                del row[field]
        with tempfile.TemporaryDirectory() as model_dir, patch.dict(os.environ, {"MILKSENSE_MODEL_DIR": model_dir}):
            result = train(rows, "test-run")

        self.assertEqual(set(result["metrics"]), {"DMY", "MF", "FC", "PC"})
        self.assertEqual(len(result["forecasts"]), 28)
        self.assertEqual(len(result["featureImportance"]["DMY"]), len(FEATURES))
        self.assertEqual(result["forecasts"][0]["date"], "2026-02-15")


if __name__ == "__main__":
    unittest.main()
