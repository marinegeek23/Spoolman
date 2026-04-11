export interface IFilamentType {
  id: number;
  registered: string;
  name: string;
  density?: number;
  settings_extruder_temp?: number;
  settings_bed_temp?: number;
  comment?: string;
  extra: { [key: string]: string };
}

export type IFilamentTypeParsedExtras = Omit<IFilamentType, "extra"> & { extra?: { [key: string]: unknown } };
