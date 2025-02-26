import fs from 'fs'
import path from 'path'
import url from 'url'

interface TPackage {
    /** Name of the package */                  name: string
    /** Version of the package */               version: { major: number, minor: number, patch: number, tag?: string }
    /** String version of the package */        versionString: string,
    /** Short description of the package */     description?: string
    /** List of keywords for discoverability */ keywords?: string[]
    /** URL of the package's homepage */        homepage?: string
    /** SPDX license identifier */              license?: string
    /** Author of the package */                author?: { name: string, email?: string, url?: string } | string
    /** List of contributors */                 contributors?: ({ name: string, email?: string, url?: string } | string)[]
    /** Funding information */                  funding?: { type?: string, url: string } | string
    /** Repository details */                   repository?: { type: string, url: string, directory?: string }
    /** Bugs tracker URL or details */          bugs?: { url?: string, email?: string } | string
    /** Entry point of the package */           main?: string
    /** ES module entry point */                module?: string
    /** Type definitions file */                types?: string
    /** Alias for `types` */                    typings?: string
    /** List of included files */               files?: string[]
    /** Executable files */                     bin?: string | Record<string, string>
    /** List of manual pages */                 man?: string | string[]
    /** Scripts for npm commands */             scripts?: Record<string, string>
    /** Package-specific configuration */       config?: Record<string, any>
    /** Production dependencies */              dependencies?: Record<string, string>
    /** Development dependencies */             devDependencies?: Record<string, string>
    /** Peer dependencies */                    peerDependencies?: Record<string, string>
    /** Optional dependencies */                optionalDependencies?: Record<string, string>
    /** Bundled dependencies */                 bundledDependencies?: string[]
    /** Engine compatibility */                 engines?: Record<string, string>
    /** Supported operating systems */          os?: string[]
    /** Supported CPU architectures */          cpu?: string[]
    /** If true, prevents publishing */         private?: boolean
    /** Publishing configuration */             publishConfig?: { access?: "public" | "restricted", registry?: string, tag?: string }
    /** Monorepo workspaces */                  workspaces?: string[] | { packages: string[], nohoist?: string[] }
    /** Dependency version overrides */         overrides?: Record<string, string | Record<string, string>>
    /** Yarn resolutions */                     resolutions?: Record<string, string>
    /** Module type */                          type?: "commonjs" | "module"
    /** Conditional exports mapping */          exports?: Record<string, string | { require?: string, import?: string, default?: string } | null>
    /** Conditional imports */                  imports?: Record<string, string>
}

let _package: any

export default function getPackage(): TPackage {

    if (_package) return _package

    const dirname = path.dirname(url.fileURLToPath(import.meta.url))
    const resource = path.join(dirname, '../../package.json')
    const pack = JSON.parse(fs.readFileSync(resource, 'utf8'))

    const [major, minor, patch, tag] = pack.version.split(/\.|-/g)

    return _package = {
        ...pack,
        versionString: pack.version,
        version: { 
            major: Number(major), 
            minor: Number(minor), 
            patch: Number(patch || 0), 
            tag 
        }
    }

}