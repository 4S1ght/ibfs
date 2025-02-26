import path from 'node:path'
import * as url from 'url'

export const dirname = (relativeTo: string) => path.dirname(url.fileURLToPath(relativeTo))