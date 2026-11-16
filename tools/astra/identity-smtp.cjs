// Local STARTTLS sink for synthetic addresses only. No relay, disk mailbox or logs.
const net = require("node:net");
const tls = require("node:tls");
exports.smtpSink = async function smtpSink(key, cert) {
  const messages = [],
    sockets = new Set();
  const secureContext = tls.createSecureContext({ key, cert });
  function attach(socket, secure = false) {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    let buffer = "",
      data = false,
      message = "";
    const receive = (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes("\r\n")) {
        const end = buffer.indexOf("\r\n"),
          line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line === ".") {
            messages.push(message);
            message = "";
            data = false;
            socket.write("250 Stored locally\r\n");
          } else message += line + "\n";
        } else if (/^EHLO/.test(line))
          socket.write(
            secure
              ? "250-localhost\r\n250 OK\r\n"
              : "250-localhost\r\n250 STARTTLS\r\n",
          );
        else if (line === "STARTTLS" && !secure) {
          socket.removeListener("data", receive);
          socket.write("220 Begin TLS\r\n", () =>
            attach(
              new tls.TLSSocket(socket, { isServer: true, secureContext }),
              true,
            ),
          );
          return;
        } else if (!secure) socket.write("530 TLS required\r\n");
        else if (/^RCPT TO:/i.test(line) && !/@example\.invalid>/i.test(line))
          socket.write("550 Synthetic recipients only\r\n");
        else if (line === "DATA") {
          data = true;
          socket.write("354 End with dot\r\n");
        } else if (line === "QUIT") socket.end("221 Bye\r\n");
        else socket.write("250 OK\r\n");
      }
    };
    socket.on("data", receive);
    if (!secure) socket.write("220 localhost synthetic SMTP\r\n");
  }
  const server = net.createServer((socket) => attach(socket));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: server.address().port,
    messages,
    close: () => {
      for (const socket of sockets) socket.destroy();
      return new Promise((resolve) => server.close(resolve));
    },
  };
};
