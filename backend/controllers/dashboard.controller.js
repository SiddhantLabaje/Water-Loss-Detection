import DashboardAnalytics from "../models/dashboardAnalytics.model.js";

const dateWiseData=async(req,res)=>{
    try {
        const today = new Date().toISOString().split('T')[0];  // "2026-08-19"
    
        const data = await DashboardAnalytics.findOne({ date: today })
          .sort({ updatedAt: -1 });
    
        if (!data) {
          return res.status(404).json({
            message: 'No analytics data for today yet. '
                    + 'Make sure analytics_pipeline.py is running.'
          });
        }
    
        res.json(data);
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    }

const latestData=async(req,res)=>{
     try {
        const data = await DashboardAnalytics.findOne()
          .sort({ updatedAt: -1 });
    
        if (!data) {
          return res.status(404).json({
            message: 'No analytics data found.'
          });
        }
    
        res.json(data);
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    }


const historyData=async(req,res)=>{
    try {
    const data = await DashboardAnalytics.find()
      .sort({ date: -1 })
      .limit(14);

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

export { dateWiseData, latestData, historyData };