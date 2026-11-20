SELECT json_agg(row_to_json(x) ORDER BY x.terminal) FROM (
 SELECT t.code AS terminal,o."operationId" AS operation,o.status AS operation_status,
        p.id AS payment,p.method,p.provider,p.status AS payment_status,p.amount,p."refundedAmount" AS refunded,
        w.id AS order_id,w.status AS order_status,a.id AS authorization,a.status AS authorization_status,
        s.id AS sale,s.status AS sale_status,c.number AS receipt,
        r.status AS reservation,r."remainingLiters" AS remaining,r."consumedLiters" AS consumed,r."releasedLiters" AS released,
        (SELECT count(*) FROM "PaymentEvent" e WHERE e."paymentId"=p.id AND e.kind='REFUNDED') AS final_events,
        (SELECT count(*) FROM "PaymentEvent" e WHERE e."orderId"=w.id AND e.kind='DEMO_REFUNDED') AS provider_transitions
 FROM "TerminalOperation" o JOIN "Terminal" t ON t.id=o."terminalId"
 JOIN "Payment" p ON p."operationId"=o."operationId"
 LEFT JOIN "OnlineOrder" w ON w."paymentId"=p.id AND w."operationId"=o."operationId"
 LEFT JOIN "FuelAuthorization" a ON a."paymentId"=p.id AND a."terminalOperationId"=o.id
 LEFT JOIN "Transaction" s ON s.id=p."transactionId" AND s."terminalOperationId"=o.id
 LEFT JOIN "Receipt" c ON c."transactionId"=s.id
 LEFT JOIN "InventoryReservation" r ON r."terminalOperationId"=o.id
 WHERE p.status='REFUNDED'
) x;
