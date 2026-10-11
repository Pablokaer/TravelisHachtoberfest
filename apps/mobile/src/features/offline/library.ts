// The one library of saved trips of this install (D-092).
import { defaultOfflineStore } from './default-store';
import { OfflineTripLibrary } from './offline-trip';

export const offlineLibrary = new OfflineTripLibrary(defaultOfflineStore);
