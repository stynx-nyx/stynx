export interface ISize {
  width: number;
  height: number;
  orientation?: number;
  type?: string;
}

export type ISizeCalculationResult = Omit<ISize, 'width' | 'height'> & {
  width: number | undefined;
  height: number | undefined;
  images?: ISize[];
};

export interface IImage<Result extends ISizeCalculationResult = ISize & { images?: ISize[] }> {
  validate: (input: Uint8Array) => boolean;
  calculate: (input: Uint8Array) => Result;
}
