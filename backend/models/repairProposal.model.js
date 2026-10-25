import mongoose from "mongoose";

const repairProposalSchema = new mongoose.Schema(
  {
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
    repairMethod: { type: String, required: true, trim: true, maxlength: 1000 },
    labourCharges: { type: Number, required: true, min: 0 },
    materialCharges: { type: Number, required: true, min: 0 },
    visitCharges: { type: Number, default: 0, min: 0 },
    otherCharges: { type: Number, default: 0, min: 0 },
    totalEstimatedCharges: { type: Number, required: true, min: 0 },
    estimatedDurationHours: { type: Number, required: true, min: 0 },
    earliestAvailability: { type: Date, required: true },
    warrantyDetails: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["submitted", "selected", "not_selected", "withdrawn", "expired"],
      default: "submitted",
    },
    withdrawnAt: { type: Date, default: null },
    withdrawnReason: { type: String, default: "" },
  },
  { collection: "repair_proposals", timestamps: true }
);

// Prevent duplicate active proposals from same plumber for same incident
repairProposalSchema.index(
  { incidentId: 1, plumberId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "submitted" },
  }
);
repairProposalSchema.index({ incidentId: 1 });
repairProposalSchema.index({ plumberId: 1 });
repairProposalSchema.index({ status: 1 });

const RepairProposal = mongoose.model("RepairProposal", repairProposalSchema);
export default RepairProposal;
