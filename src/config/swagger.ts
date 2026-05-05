import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

export const swaggerSpec = yaml.load(
  readFileSync(join(__dirname, '../../swagger.yaml'), 'utf8'),
) as object;
