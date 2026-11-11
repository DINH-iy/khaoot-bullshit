import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import type { Config } from './config.js';

export function startTelemetry(config: Config): NodeSDK | undefined {
  if (!config.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) return undefined;
  const sdk = new NodeSDK({
    serviceName: 'party-server',
    traceExporter: new OTLPTraceExporter({ url: config.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT, timeoutMillis: 3000 }),
  });
  sdk.start();
  return sdk;
}
