import { WithoutTimestamps } from '../timeStampSchema';
import { FSHandle } from './fSHandle';

/** Repository write DTO for put: the repository assigns the timestamps. */
export type FSHandleDTO = WithoutTimestamps<FSHandle>;
