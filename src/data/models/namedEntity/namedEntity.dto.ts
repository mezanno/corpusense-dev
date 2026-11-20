import { WithoutTimestamps } from '../timeStampSchema';
import { NamedEntity } from './namedEntity';

/** Repository write DTO: the repository assigns the timestamps. */
export type NamedEntityDTO = WithoutTimestamps<NamedEntity>;
