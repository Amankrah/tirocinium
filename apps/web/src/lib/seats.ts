// The seat redemption boundary. The real call is POST /api/v1/seats/redeem
// (backend guide 7.1), which does not exist in the contract yet: it lands
// with backend milestone 1.5, at which point this function switches to the
// generated client and its types. Until then it reports failure, which the
// entry screen renders with the same honest line a wrong code would get.
// No server data types are hand-written here (frontend guide 7): the shape
// below is a local discriminant only.
export async function redeemSeatCode(code: string): Promise<{ ok: boolean }> {
  void code;
  return { ok: false };
}
