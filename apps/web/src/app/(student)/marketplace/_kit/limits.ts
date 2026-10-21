// How many lines the comparison tray holds. A plain module on purpose: a
// value exported from a "use client" module reaches a Server Component as a
// client reference rather than the number, which once made the brief page
// slice its candidates to nothing (the same trap as FIG_PREFIX, decision 0066).
export const TRAY_LIMIT = 5;
