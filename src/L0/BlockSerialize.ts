// Imports ========================================================================================

import { crc32 } from 'node:zlib'

import Memory from "./Memory.js"
import SectorSerialize, { SectorSize, HeadSector, LinkSector, StorageSector } from "./SectorSerialize.js"
import SectorAES, { SectorAESConfig } from "./SectorAES.js"
import IBFSError from "../errors/IBFSError.js"

// Types ==========================================================================================

interface BlockSerializeConfig extends SectorAESConfig {
    sectorSize: SectorSize
}

interface CommonCreateMeta {
    address: number
    aesKey?: Buffer
}

interface CreateHeadBlock extends HeadSector, CommonCreateMeta {}
interface CreateLinkBock extends LinkSector, CommonCreateMeta {}
interface CreateStorageBlock extends StorageSector, CommonCreateMeta {}

// Module =========================================================================================

export default class BLockSerialize {

    private sectorSize: SectorSize
    private ss: SectorSerialize
    private aes: SectorAES
    
    constructor(config: BlockSerializeConfig) {
        this.sectorSize = config.sectorSize
        this.ss = new SectorSerialize({ sectorSize: config.sectorSize })
        this.aes = new SectorAES({ iv: config.iv, cipher: config.cipher })
    }

    public createHeadBlock(block: CreateHeadBlock): Eav<Buffer, IBFSError> {
        try {

            const src = Memory.intake(block.data)
            const dist = Memory.alloc(this.sectorSize * (1+block.blockRange))

            // Head sector ========================================

            const hsData = src.read(this.ss.HEAD_CONTENT)
            this.aes.encrypt(hsData, block.aesKey!, block.address)

            dist.write(this.ss.createHeadSector({
                created:    block.created,
                modified:   block.modified,
                data:       hsData,
                next:       block.next,
                crc32Sum:   crc32(hsData),
                blockRange: block.blockRange,
                endPadding: dist.length - SectorSerialize.HEAD_META - src.length
            }))

            // Data sectors =======================================

            for (let address = 0; address < block.blockRange; address++) {
                const ssData = src.read(this.sectorSize)
                this.aes.encrypt(ssData, block.aesKey!, address+1)
                dist.write(ssData)
            }
            
            return [null, dist.buffer]

        } 
        catch (error) {
            return [new IBFSError('L0_BS_CANT_SERIALIZE_HEAD', null, error as Error), null]
        }
    }

    public createLinkBlock(block: CreateLinkBock) {}

    public createStoreBlock(block: CreateStorageBlock) {}


}