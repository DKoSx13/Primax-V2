import type { Provider } from '@nestjs/common';
import { ORDER_WORKFLOW } from '../application/ports/order-workflow';
import { OrderWorkflow } from '../application/use-cases/order-workflow';
import { OrderWorkflowAdapter } from '../adapters/inbound/order-workflow.adapter';
import { ExistingOrderWorkflow, ExistingOrderInputs, ExistingOrderViews } from '../adapters/outbound/existing-order-workflow';

export const orderWorkflowProviders: Provider[] = [
  ExistingOrderWorkflow,
  { provide: ORDER_WORKFLOW, inject: [ExistingOrderWorkflow], useFactory: (orders: ExistingOrderWorkflow) => new OrderWorkflow<ExistingOrderInputs,ExistingOrderViews>(orders) },
  OrderWorkflowAdapter,
];
