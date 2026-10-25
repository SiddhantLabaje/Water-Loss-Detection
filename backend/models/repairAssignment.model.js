import mongoose from "mongoose";

const repairAssignmentSchema = new mongoose.Schema(
  {
    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeakEvent",
      required: true,
    },
    selectedProposalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RepairProposal",
      required: true,
    },
    plumberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: [
        "assigned",
        "accepted",
        "in_progress",
        "completed",
        "cancelled",
        "reassigned",
      ],
      default: "assigned",
    },
    reassignmentReason: { type: String, default: "" },
    statusHistory: [
      {
        status: String,
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        reason: String,
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { collection: "repair_assignments", timestamps: true }
);

repairAssignmentSchema.index({ plumberId: 1 });
repairAssignmentSchema.index({ status: 1 });
repairAssignmentSchema.index(
  { incidentId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["assigned", "accepted", "in_progress"] } },
  }
);

const RepairAssignment = mongoose.model("RepairAssignment", repairAssignmentSchema);
export default RepairAssignment;
