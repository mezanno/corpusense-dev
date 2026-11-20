import { WithoutTimestamps } from '../timeStampSchema';
import { ModifierChain } from './Modifier';

/** Repository write DTO for add/put: the repository assigns the timestamps. */
export type ModifierChainDTO = WithoutTimestamps<ModifierChain>;
