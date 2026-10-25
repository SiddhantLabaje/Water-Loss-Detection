import mongoose from "mongoose";

const repairRecordSchema = new mongoose.Schema(
  {
    assignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RepairAssignment",
      required: true,
      unique: true,
    },
    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeakEvent",
      required: true,
    },
    plumberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    workDescription: { type: String, required: true, trim: true },
    partsUsed: { type: String, trim: true, default: "" },
    labourCharges: { type: Number, required: true, min: 0 },
    materialCharges: { type: Number, required: true, min: 0 },
    finalAmount: { type: Number, required: true, min: 0 },
    completionNotes: { type: String, trim: true, default: "" },
    completionReportedAt: { type: Date, required: true },
    furtherWorkRequired: { type: Boolean, default: false },
    recoveryVerificationStatus: {
      type: String,
      enum: [
        "pending",
        "verifying",
        "verified",
        "failed",
        "inconclusive",
        "requires_inspection",
      ],
      default: "pending",
    },
    verificationAttempts: [
      {
        attemptedAt: Date,
        flowSensorData: Number,
        pressureSensorData: Number,
        tankLevelSensorData: Number,
        turbiditySensorData: Number,
        mlProbability: Number,
        overallSystemStatus: String,
        passed: Boolean,
        reason: String,
      },
    ],
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { collection: "repair_records", timestamps: true }
);

repairRecordSchema.index({ incidentId: 1 });
repairRecordSchema.index({ plumberId: 1 });
repairRecordSchema.index({ recoveryVerificationStatus: 1 });

const RepairRecord = mongoose.model("RepairRecord", repairRecordSchema);
export default RepairRecord;
