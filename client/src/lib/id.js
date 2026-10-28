import { v4 } from 'uuid';

// uuid package (not crypto.randomUUID) so it also works on http:// LAN addresses
export const newId = () => v4();