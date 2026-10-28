/**
 * Tipagens TypeScript do Sistema LicitWatch MT (PNCP + Machine Learning).
 */

export type ModoModelo = "auditoria" | "preventivo";

export interface ItemShap {
  codigo: string;
  atributo: string;
  valorReal: number;
  valorFormatado: string;
  impactoShap: number;
  direcao: string;
}

export interface ResultadoModo {
  isAnomalia: boolean;
  riscoPercentual: number;
  scoreAnomalia: number;
  posicaoRanking: number;
  faixaPrioridade: string;
  rotuloCurto: string;
  nivel: "alta" | "media" | "baixa" | "normal";
  cor: string;
  recomendacao: string;
  shap: ItemShap[];
}

export interface ProcessoLicitatorio {
  id: number;
  idPncp: string;
  idPncpCompra: string;
  processo: string;
  empenho: string;
  tipoContrato: string;
  categoria: string;
  anoContrato: number;
  dataAssinatura: string;
  dataVigenciaInicio: string;
  dataVigenciaFim: string;
  orgaoNome: string;
  orgaoCnpj: string;
  orgaoCnpjFormatado: string;
  unidadeNome: string;
  esferaId: string;
  poderId: string;
  municipio: string;
  fornecedorNome: string;
  fornecedorDoc: string;
  fornecedorDocFormatado: string;
  tipoPessoa: string;
  objeto: string;
  valorInicial: number;
  valorGlobal: number;
  valorParcela: number;
  valorAditivado: number;
  proporcaoParcelaGlobal: number;
  logValorGlobal: number;
  tempoVigenciaDias: number;
  numeroRetificacoes: number;
  numeroParcelas: number;
  auditoria: ResultadoModo;
  preventivo: ResultadoModo;
}

export interface EstatisticasMt {
  total_contratos: number;
  mediana_valor_global: number;
  media_valor_global: number;
  mediana_vigencia_dias: number;
  qtd_anomalias_auditoria: number;
  qtd_anomalias_preventivo: number;
}

export interface BaseCompletaPayload {
  estatisticasMt: EstatisticasMt;
  processos: ProcessoLicitatorio[];
}

export interface OpcaoCidade {
  municipio: string;
  totalProcessos: number;
  totalComRisco: number;
  riscoMedioPct: number;
  valorEmRisco: number;
}

export interface ResumoBusca {
  totalEncontrados: number;
  qtdComRisco: number;
  qtdCriticos: number;
  qtdSemRisco: number;
  percentualComRisco: number;
  eficienciaFiscal: number;
  valorTotalGlobal: number;
  valorPotencialRisco: number;
  riscoMedioPct: number;
}

export interface HistoricoFornecedor {
  fornecedorDoc: string;
  fornecedorDocFormatado: string;
  fornecedorNome: string;
  totalContratosEstado: number;
  contratosComRiscoEstado: number;
  valorTotalEstado: number;
}

export interface ResumoEmpresa {
  fornecedorDoc: string;
  fornecedorDocFormatado: string;
  fornecedorNome: string;
  tipoPessoa: string;
  totalProcessos: number;
  qtdComRisco: number;
  maiorRiscoPct: number;
  valorTotalContratado: number;
  valorEmRisco: number;
  cidadesAtuacao: string[];
}
