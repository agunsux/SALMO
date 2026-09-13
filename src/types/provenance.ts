// SALMO.DEV — Canonical Data Provenance & Traceability Contract
// Guarantees every decision can be audited to source data, line settlement, and calculation version.

import { LifecycleStage } from './index';

export type ProvenanceDataStatus = 'AVAILABLE' | 'DATA_UNAVAILABLE' | 'INSUFFICIENT_DATA' | 'UNVERIFIED';

export interface CanonicalProvenanceDTO {
  source: string;
  sourceProvider: string;
  sourceVersion: string;
  datasetVersion: string;
  canonicalMatchId: string;
  calculationVersion: string;
  settlementMethodology: string;
  validationStage: LifecycleStage;
  dataStatus: ProvenanceDataStatus;
  sampleSize: number;
  checksum: string;
  generatedAt: string;
}

export class ProvenanceBuilder {
  public static create(params: {
    canonicalMatchId: string;
    market: string;
    line: string;
    sampleSize: number;
    datasetVersion?: string;
    validationStage?: LifecycleStage;
    dataStatus?: ProvenanceDataStatus;
    checksum?: string;
  }): CanonicalProvenanceDTO {
    return {
      source: 'Football-Data.co.uk / Pinnacle Closing Lines',
      sourceProvider: 'HandicapLab Canonical Ingest',
      sourceVersion: 'v0.32.0',
      datasetVersion: params.datasetVersion || 'epl-canonical-bronze-2019-2026',
      canonicalMatchId: params.canonicalMatchId,
      calculationVersion: 'salmo-engine-v1.0',
      settlementMethodology: 'Quarter-Line Split Settlement (Decoupled)',
      validationStage: params.validationStage || 'UNVERIFIED',
      dataStatus: params.dataStatus || (params.sampleSize >= 20 ? 'AVAILABLE' : 'INSUFFICIENT_DATA'),
      sampleSize: params.sampleSize,
      checksum: params.checksum || 'sha256-canonical-salmo-v1',
      generatedAt: new Date().toISOString(),
    };
  }
}

