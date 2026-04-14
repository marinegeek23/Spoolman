import { IVendor } from "../vendors/model";

export interface ISpoolTypeCategory {
  id: number;
  registered: string;
  name: string;
}

export interface ISpoolType {
  id: number;
  registered: string;
  vendor: IVendor;
  category?: ISpoolTypeCategory;
  weight?: number;
  color?: string;
}
