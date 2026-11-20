import { WithoutTimestamps } from '../timeStampSchema';
import { Tag } from './tag';

/** Repository write DTO: the repository assigns the timestamps. */
export type TagDTO = WithoutTimestamps<Tag>;
