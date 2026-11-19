import { orderWorkflowProviders } from '../../services/commerce/src/bootstrap/order-workflow.providers';
import { DemoWalletProvider } from './demo-provider';
import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CulqiProvider, PAYMENT_PROVIDER } from './payment-provider';
import { PaymentLifecycleController, PaymentLifecycleService } from './payment-lifecycle';
import { PaymentWebhookController } from './webhook';
import { OnlineOrdersController, OnlineOrdersService } from './online-orders';
import { PartialRefundController, PartialRefundService } from './partial-refund';
import { paymentWorkflowProviders } from '../../services/commerce/src/bootstrap/payment-workflow.providers';
@Module({ controllers:[OnlineOrdersController,PaymentWebhookController,PaymentLifecycleController,PartialRefundController],providers: [...orderWorkflowProviders,...paymentWorkflowProviders,PaymentsService,CulqiProvider,DemoWalletProvider,{provide:PAYMENT_PROVIDER,inject:[CulqiProvider,DemoWalletProvider],useFactory:(commercial:CulqiProvider,demo:DemoWalletProvider)=>process.env.DEMO_WALLET_ENABLED==='true'?demo:commercial},OnlineOrdersService,PaymentLifecycleService,PartialRefundService], exports: [PaymentsService,OnlineOrdersService] })
export class PaymentsModule {}
