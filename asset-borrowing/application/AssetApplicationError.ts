export class AssetApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetApplicationError';
  }
}
