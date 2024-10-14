// lib/progressStore.ts

export interface ProgressData {
    totalFiles: number;
    processedFiles: number;
    processingFiles: string[];
    isComplete: boolean; // Indicates whether processing is complete
  }
  
  class ProgressStore {
    private store: Map<string, ProgressData>;
  
    constructor() {
      this.store = new Map<string, ProgressData>();
    }
  
    public set(uploadId: string, data: ProgressData) {
      this.store.set(uploadId, data);
    }
  
    public get(uploadId: string): ProgressData | undefined {
      return this.store.get(uploadId);
    }
  
    public delete(uploadId: string) {
      this.store.delete(uploadId);
    }
  }
  
  // Ensure a single instance across module reloads in development
  declare global {
    var progressStoreInstance: ProgressStore | undefined;
  }
  
  const progressStore = global.progressStoreInstance || new ProgressStore();
  
  if (!global.progressStoreInstance) {
    global.progressStoreInstance = progressStore;
  }
  
  Object.freeze(progressStore);
  
  export { progressStore };
  