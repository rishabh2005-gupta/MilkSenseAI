import numpy as np
from sklearn.base import BaseEstimator, TransformerMixin


class IqrClipper(BaseEstimator, TransformerMixin):
    def fit(self, values, _targets=None):
        frame = np.asarray(values, dtype=float)
        self.lower_ = np.full(frame.shape[1], -np.inf)
        self.upper_ = np.full(frame.shape[1], np.inf)
        for index in range(frame.shape[1]):
            finite = frame[:, index][np.isfinite(frame[:, index])]
            if finite.size:
                first_quartile, third_quartile = np.quantile(finite, [0.25, 0.75])
                spread = third_quartile - first_quartile
                self.lower_[index] = first_quartile - 1.5 * spread
                self.upper_[index] = third_quartile + 1.5 * spread
        return self

    def transform(self, values):
        frame = np.asarray(values, dtype=float)
        return np.clip(frame, self.lower_, self.upper_)
