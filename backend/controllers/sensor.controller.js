import Sensor from "../models/sensor.model.js";

/**
 * GET /api/sensors/sensor-data?limit=100&page=1
 * Returns paginated raw sensor records, newest first.
 */
export const getSensorData = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
    const skip  = (page - 1) * limit;

    const [data, total] = await Promise.all([
      Sensor.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Sensor.countDocuments(),
    ]);

    res.json({ total, page, limit, pages: Math.ceil(total / limit), data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /api/sensors/latest
 * Returns the single most-recent sensor document.
 */
export const getLatestSensor = async (req, res) => {
  try {
    const doc = await Sensor.findOne().sort({ createdAt: -1 }).lean();

    if (!doc) {
      return res
        .status(404)
        .json({ message: "No sensor records found yet." });
    }

    res.json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export default getSensorData;
