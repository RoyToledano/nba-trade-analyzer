// ---------------------------------------------------------------------------
// models.js — Mongoose schemas for NBA teams and players
// ---------------------------------------------------------------------------

import mongoose from "mongoose";

const playerSchema = new mongoose.Schema(
  {
    bdl_id: { type: Number, default: null },
    first_name: { type: String, required: true },
    last_name: { type: String, required: true },
    position: { type: String, default: "" },
    salary: { type: Number, default: null },
    totalRemaining: { type: Number, default: null },
    // Contract details (populated from HoopsHype seasons data)
    yearsRemaining: { type: Number, default: null },
    isExpiring: { type: Boolean, default: false },
    contractYears: {
      type: [{ season: Number, salary: Number }],
      default: [],
    },
    // Trade eligibility
    tradeStatus: {
      type: String,
      enum: ["tradeable", "trade-candidate", "not-tradable"],
      default: "tradeable",
    },
    tradeRestrictionNote: { type: String, default: "" },
  },
  { _id: false }
);

const teamSchema = new mongoose.Schema(
  {
    bdl_id: { type: Number, required: true, unique: true, index: true },
    full_name: { type: String, required: true },
    abbreviation: { type: String, default: "" },
    city: { type: String, default: "" },
    conference: { type: String, default: "" },
    division: { type: String, default: "" },
    name: { type: String, default: "" },
    players: [playerSchema],
    lastSyncedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Team = mongoose.model("Team", teamSchema);
