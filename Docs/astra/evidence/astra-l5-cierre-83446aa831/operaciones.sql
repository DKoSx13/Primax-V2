SELECT row_to_json(s) FROM (
 SELECT t.code AS terminal, o."operationId", o.status, p.id AS payment, p.status AS payment_status,
        p.amount, p."refundedAmount", w.id AS order_id, a.id AS authorization, a.status AS authorization_status,
        s.id AS sale, s.status AS sale_status, c.number AS receipt,
        r.status AS reservation, r."consumedLiters", r."remainingLiters", r."releasedLiters",
        (SELECT count(*) FROM "PaymentEvent" e WHERE e.kind='REFUNDED' AND e."paymentId"=p.id) AS refund_events
 FROM "TerminalOperation" o
 JOIN "Terminal" t ON t.id=o."terminalId"
 LEFT JOIN "Payment" p ON p."operationId"=o."operationId"
 LEFT JOIN "OnlineOrder" w ON w."operationId"=o."operationId" AND w."paymentId"=p.id
 LEFT JOIN "FuelAuthorization" a ON a."terminalOperationId"=o.id AND a."paymentId"=p.id
 LEFT JOIN "Transaction" s ON s."terminalOperationId"=o.id AND s.id=p."transactionId"
 LEFT JOIN "Receipt" c ON c."transactionId"=s.id
 LEFT JOIN "InventoryReservation" r ON r."terminalOperationId"=o.id
 ORDER BY o."openedAt"
) s;
SELECT json_build_object(
 'payments',(SELECT count(*) FROM "Payment"),
 'orders',(SELECT count(*) FROM "OnlineOrder"),
 'authorizations',(SELECT count(*) FROM "FuelAuthorization"),
 'sales',(SELECT count(*) FROM "Transaction"),
 'receipts',(SELECT count(*) FROM "Receipt"),
 'operations',(SELECT count(*) FROM "TerminalOperation"),
 'open_operations',(SELECT count(*) FROM "TerminalOperation" WHERE "closedAt" IS NULL),
 'total_amount',(SELECT sum(amount) FROM "Payment"),
 'refunded_amount',(SELECT sum("refundedAmount") FROM "Payment")
);
