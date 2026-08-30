/** Firebase adapter contract. Import Firebase SDK and implement only after configuration is approved. */
export const firebaseService = {
  async initialize() { throw new Error('Firebase 尚未整合。'); },
  async signIn() { throw new Error('Firebase Authentication 尚未整合。'); },
  async saveAssessment() { throw new Error('Firestore 尚未整合。'); },
  async getAssessments() { throw new Error('Firestore 尚未整合。'); },
};
