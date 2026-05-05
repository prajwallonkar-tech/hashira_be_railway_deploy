import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { swaggerSpec } from '../src/config/swagger';

const outputPath = path.resolve(__dirname, '../swagger.yaml');
fs.writeFileSync(outputPath, yaml.dump(swaggerSpec, { noRefs: true }));
console.log(`Swagger spec exported to ${outputPath}`);
