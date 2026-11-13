import { createServer, type IncomingHttpHeaders } from "node:http"
import type { AddressInfo } from "node:net"

/** One request the receiver got, as it arrived. */
export type ReceivedRequest = {
  method: string
  headers: IncomingHttpHeaders
  /** The raw bytes, so a signature can be checked over exactly what was sent. */
  body: Buffer
}

/**
 * A stand-in for Home Assistant or n8n: a server on 127.0.0.1 that keeps
 * every request and answers with whatever the test last asked for (200 "ok"
 * to begin with). Its address is on the home network, so tests that send to
 * it allow that first. Close it when the tests are done.
 */
export async function startReceiver() {
  const requests: ReceivedRequest[] = []
  let status = 200
  let answer = "ok"

  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => {
      requests.push({
        method: req.method ?? "",
        headers: req.headers,
        body: Buffer.concat(chunks),
      })
      res.writeHead(status, { "content-type": "text/plain; charset=utf-8" })
      res.end(answer)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    requests,
    /** What it answers from now on. */
    answer(nextStatus: number, nextBody = "") {
      status = nextStatus
      answer = nextBody
    },
    close() {
      // Merran's fetcher keeps connections open, which would hold close up.
      server.closeAllConnections()
      return new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

export type Receiver = Awaited<ReturnType<typeof startReceiver>>
