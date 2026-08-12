import { configure } from "@testing-library/dom";

// Testing Library's async helpers (waitFor, findBy*) default to a one-second
// budget, which is the tightest timing assumption in the whole web suite: with
// sixteen workers on one machine a starved worker can miss that window on a test
// that is perfectly correct. The suite has twice shown a single unreproducible
// failure under exactly that load, so the budget is raised rather than left as
// the most likely explanation. Nothing gets slower: a passing assertion returns
// on its first successful poll, and only a genuinely failing one waits.
configure({ asyncUtilTimeout: 5_000 });
