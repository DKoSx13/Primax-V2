import {
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class CompatibilityPort {
  constructor(private readonly config: ConfigService) {}
  async call(operation: string, input: unknown = {}) {
    try {
      const response = await fetch(
        this.config.getOrThrow<string>("IDENTITY_COMPAT_URL") +
          "/identity-compat/" +
          operation,
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(4000),
          headers: {
            "content-type": "application/json",
            "x-identity-compat-key": this.config.getOrThrow(
              "IDENTITY_COMPAT_KEY",
            ),
          },
          body: JSON.stringify(input),
        },
      );
      const body: unknown = await response.json();
      if (response.ok) return body;
      if (response.status === 404) throw new NotFoundException(body as object);
      if ([400, 401, 403, 404, 409].includes(response.status))
        throw new HttpException(body as object, response.status);
      throw new Error("Unavailable");
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        "Dependencia de compatibilidad temporalmente no disponible",
      );
    }
  }
}
