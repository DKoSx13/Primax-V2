SELECT json_agg(row_to_json(q) ORDER BY q.operation_id) FROM (
 SELECT o."operationId" AS operation_id, t.code AS terminal,o.id AS terminal_operation_id, o.status,
 (SELECT count(*) FROM "Payment" p WHERE p."operationId"=o."operationId") AS payments,
 (SELECT count(*) FROM "OnlineOrder" p WHERE p."operationId"=o."operationId") AS orders,
 (SELECT count(*) FROM "FuelAuthorization" a WHERE a."operationId"=o."operationId") AS authorizations,
 (SELECT count(*) FROM "Transaction" s WHERE s."operationId"=o."operationId") AS sales,
 (SELECT json_agg(json_build_object('order', w.id,'payment',p.id,'authorization',a.id,'reservation',r.status,'remaining',r."remainingLiters",'sale',s.id,'saleStatus',s.status,'amount',s.amount,'receipt',c.number))
 FROM "OnlineOrder" w JOIN "Payment" p ON p.id=w."paymentId" AND p."operationId"=w."operationId"
 JOIN "FuelAuthorization" a ON a."paymentId"=p.id AND a."operationId"=o."operationId" AND a."terminalOperationId"=o.id AND a."terminalId"=t.id
 JOIN "Transaction" s ON s."authorizationId"=a.id AND s.id=p."transactionId"
 JOIN "InventoryReservation" r ON r."authorizationId"=a.id AND r."transactionId"=s.id
 JOIN "Receipt" c ON c."transactionId"=s.id WHERE w."operationId"=o."operationId") AS settled
 FROM "TerminalOperation" o JOIN "Terminal" t ON t.id=o."terminalId") q;
