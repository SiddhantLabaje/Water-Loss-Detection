import MlPrediction from "../models/mlPrediction.model.js";

/**
 * GET /api/ml-predictions/latest
 * Returns the single most-recent ML prediction document.
 */
export const getLatestPrediction = async (req, res) => {
  try {
    const doc = await MlPrediction.findOne().sort({ _id: -1 });

    if (!doc) {
      return res.status(404).json({
        message:
          "No ML predictions found. Make sure the Python prediction pipeline is running.",
      });
    }

    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/ml-predictions/history?limit=50&page=1
 * Returns paginated prediction history, newest first.
 */
export const getPredictionHistory = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
    const skip  = (page - 1) * limit;

    const [docs, total] = await Promise.all([
      MlPrediction.find()
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      MlPrediction.countDocuments(),
    ]);

    res.json({
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      data: docs,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/ml-predictions/stats
 * Returns aggregated statistics for the dashboard summary cards.
 */
export const getPredictionStats = async (req, res) => {
  try {
    const total = await MlPrediction.countDocuments();

    if (total === 0) {
      return res.json({
        total: 0,
        leakCount: 0,
        leakRate: 0,
        criticalCount: 0,
        warningCount: 0,
        normalCount: 0,
        avgLeakProbability: 0,
        avgWaterLossRate: 0,
        latest: null,
      });
    }

    const [leakCount, criticalCount, warningCount, latest, aggregation] =
      await Promise.all([
        MlPrediction.countDocuments({ mlPredictionData: 1 }),
        MlPrediction.countDocuments({ overallSystemStatus: "CRITICAL" }),
        MlPrediction.countDocuments({ overallSystemStatus: "WARNING" }),
        MlPrediction.findOne().sort({ _id: -1 }).lean(),
        MlPrediction.aggregate([
          {
            $group: {
              _id: null,
              avgLeakProbability: { $avg: "$mlProbability" },
              avgWaterLossRate:   { $avg: "$waterLossRate" },
            },
          },
        ]),
      ]);

    const agg = aggregation[0] || {};

    res.json({
      total,
      leakCount,
      leakRate: total > 0 ? parseFloat(((leakCount / total) * 100).toFixed(1)) : 0,
      criticalCount,
      warningCount,
      normalCount: total - criticalCount - warningCount,
      avgLeakProbability: parseFloat((agg.avgLeakProbability || 0).toFixed(1)),
      avgWaterLossRate:   parseFloat((agg.avgWaterLossRate   || 0).toFixed(2)),
      latest,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/ml-predictions/alerts?limit=10
 * Returns the most recent CRITICAL and WARNING records for the alert panel.
 */
export const getAlerts = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);

    const docs = await MlPrediction.find({
      overallSystemStatus: { $in: ["CRITICAL", "WARNING"] },
    })
      .sort({ _id: -1 })
      .limit(limit)
      .lean();

    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
