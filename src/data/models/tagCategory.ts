import { Tag } from './tag';

export interface TagCategory {
  id: string; //uuid
  label: string;
  description?: string;
  tags?: Tag[];
}
