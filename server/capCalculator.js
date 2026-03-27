// ---------------------------------------------------------------------------
// capCalculator.js — Per-team cap position calculation
// ---------------------------------------------------------------------------
// Computes total team salary and classifies the team's cap status relative
// to CBA thresholds (under cap, over cap / taxpayer, 1st apron, 2nd apron).
// ---------------------------------------------------------------------------

import { getCapThresholds } from "./capThresholds.js";

/**
 * Cap status labels in order of increasing severity.
 */
export const CAP_STATUS = {
  UNDER_CAP: "under-cap",
  OVER_CAP: "over-cap",
  TAXPAYER: "taxpayer",
  FIRST_APRON: "first-apron",
  SECOND_APRON: "second-apron",
};

/**
 * Classifies a total salary amount against CBA thresholds.
 * Pure function — does not fetch thresholds itself.
 *
 * @param {number} totalSalary
 * @param {object} thresholds - Season CBA thresholds from getCapThresholds()
 * @returns {string} One of the CAP_STATUS values
 */
export function classifyCapStatus(totalSalary, thresholds) {
  if (totalSalary >= thresholds.secondApron) return CAP_STATUS.SECOND_APRON;
  if (totalSalary >= thresholds.firstApron) return CAP_STATUS.FIRST_APRON;
  if (totalSalary >= thresholds.luxuryTax) return CAP_STATUS.TAXPAYER;
  if (totalSalary >= thresholds.salaryCap) return CAP_STATUS.OVER_CAP;
  return CAP_STATUS.UNDER_CAP;
}

/**
 * Computes the cap position for a team given its players and the season year.
 *
 * @param {Array} players - Array of player objects with `salary` field (numbers in dollars)
 * @param {number} seasonYear - HoopsHype season year (e.g. 2026 for 2025-26)
 * @returns {{ totalSalary, capStatus, capSpace, taxSpace, firstApronSpace, secondApronSpace, thresholds }}
 */
export function computeCapPosition(players, seasonYear) {
  const thresholds = getCapThresholds(seasonYear);

  // Sum all player salaries (exclude null/undefined)
  const totalSalary = players.reduce((sum, p) => sum + (p.salary ?? 0), 0);
  const capStatus = classifyCapStatus(totalSalary, thresholds);

  return {
    totalSalary,
    capStatus,
    // Positive = room remaining, negative = over the line
    capSpace: thresholds.salaryCap - totalSalary,
    taxSpace: thresholds.luxuryTax - totalSalary,
    firstApronSpace: thresholds.firstApron - totalSalary,
    secondApronSpace: thresholds.secondApron - totalSalary,
    thresholds: {
      salaryCap: thresholds.salaryCap,
      luxuryTax: thresholds.luxuryTax,
      firstApron: thresholds.firstApron,
      secondApron: thresholds.secondApron,
      salaryFloor: thresholds.salaryFloor,
    },
  };
}

/**
 * Returns a human-readable label for a cap status.
 */
export function capStatusLabel(status) {
  const labels = {
    [CAP_STATUS.UNDER_CAP]: "Under the salary cap",
    [CAP_STATUS.OVER_CAP]: "Over the cap",
    [CAP_STATUS.TAXPAYER]: "Luxury tax payer",
    [CAP_STATUS.FIRST_APRON]: "1st apron (hard-capped)",
    [CAP_STATUS.SECOND_APRON]: "2nd apron (hard-capped)",
  };
  return labels[status] ?? "Unknown";
}
