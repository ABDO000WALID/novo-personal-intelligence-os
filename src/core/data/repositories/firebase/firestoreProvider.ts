import * as firestore from 'firebase/firestore';

export let fs = firestore;

export function setMockFirestore(mock: any) {
  fs = mock as typeof firestore;
}
