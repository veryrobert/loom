// Accounts aren't hooked up yet. Everything is stored on this device for a single local, signed-out
// user, but every record is tagged with its owner so a future sign-in can claim and sync it.
// See docs/accounts.md.

export interface Account {
  /** Stable id records are tagged with ('local' until a real account exists). */
  id: string;
  name: string;
  signedIn: boolean;
}

export const LOCAL_ACCOUNT: Account = { id: 'local', name: 'This device', signedIn: false };

/** The account new records belong to. Always the local one for now. */
export function currentAccount(): Account {
  return LOCAL_ACCOUNT;
}
