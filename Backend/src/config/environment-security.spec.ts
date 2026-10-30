import { validateEnvironment } from './environment';
const production = (url: string) => ({
  APP_MODE:'production',DATABASE_URL:'postgresql://user:fictional@database.example/db?sslmode=require',JWT_SECRET:'j'.repeat(48),KIOSK_API_KEY:'k'.repeat(48),
  PASSWORD_RESET_DELIVERY:'smtp',SMTP_HOST:'mail.example',SMTP_FROM:'app@example.test',PAYMENT_ENV:'production',CULQI_SECRET_KEY:'sk_live_fixture',PAYMENT_WEBHOOK_SECRET:'w'.repeat(48),
  CORS_ORIGINS:'https://fuel.example,https://control.example',PLATE_RECOGNITION_ENABLED:'true',PLATE_RECOGNITION_URL:url,
});
it('production OCR requires HTTPS, while preserving explicit local HTTP support',()=>{
 expect(()=>validateEnvironment(production('http://ocr.example'))).toThrow('Production OCR requires');
 expect(()=>validateEnvironment(production('https://ocr.example'))).not.toThrow();
 expect(()=>validateEnvironment({...production('http://127.0.0.1:8000'),APP_MODE:'local',DATABASE_URL:'postgresql://test:test@127.0.0.1/test'})).not.toThrow();
});
