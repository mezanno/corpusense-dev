import { WithoutTimestamps } from '../timeStampSchema';
import { DataModel } from './dataModel';

export interface DataModelCreateDTO {
  name: string;
  description?: string;
  fromModelId?: string;
}

/** Repository write DTO: the repository assigns the timestamps. */
export type DataModelDTO = WithoutTimestamps<DataModel>;
