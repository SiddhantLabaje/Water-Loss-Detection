import mongoose from 'mongoose';

const dashboardAnalyticsSchema = new mongoose.Schema( {
    date:       { type: String },  
    updatedAt:  { type: String },

    liveSensor: {
      flowRate:    { type: Number },
      pressure:    { type: Number },
      waterLevel:  { type: Number },
      turbidity:   { type: Number },
      lastUpdated: { type: String },
    },

    leakAnalysis: {
      leakStatus:       { type: String }, 
      leakDetected:     { type: Boolean },
      leakProbability:  { type: Number },
      leakSeverity:     { type: String },
      isEstimated:      { type: Boolean },
      estimationMethod: { type: String },
    },

    lossAnalysis: {
      estimatedLossLPH: { type: Number },
      leakZone:         { type: String },
      isEstimated:      { type: Boolean },
      estimationMethod: { type: String },
    },

    consumptionToday: {
      totalLitres:      { type: Number },
      estimatedLossL:   { type: Number },
      lossPercentage:   { type: Number },
      isEstimated:      { type: Boolean },
      estimationMethod: { type: String },
    },

    forecast: {
      predictedTomorrowLitres: { type: Number },
      expectedLossLitres:      { type: Number },
      isEstimated:             { type: Boolean },
      estimationMethod:        { type: String },
      daysOfHistoryUsed:       { type: Number },
    },

    systemStatus: {
      mlModelActive:      { type: Boolean },
      totalRecordsToday:  { type: Number },
      leakRecordsToday:   { type: Number },
    },
  },
  {
    collection: 'dashboard_analytics',
    timestamps: false,
  });

const DashboardAnalytics=mongoose.model("DashboardAnalytics",dashboardAnalyticsSchema);

export default DashboardAnalytics;