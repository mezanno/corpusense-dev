import { WithoutTimestamps } from '../timeStampSchema';
import { Project } from './project';

/** Repository write DTO: the repository assigns the timestamps. */
export type ProjectDTO = WithoutTimestamps<Project>;
