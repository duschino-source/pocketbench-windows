import { describe, it, expect } from 'vitest'
import { redact } from '../src/main/model'
describe('diagnostic redaction before model transmission',()=>{
  it('removes user profile names, emails, bearer tokens and named credentials',()=>{
    const text='C:\\Users\\Alice\\profile\ncontact=alice@example.com\nAuthorization: Bearer secret-token-123\napi_key=private-secret-123 password=hunter2 access_token=abcdef'
    const safe=redact(text)
    for(const secret of ['Alice','alice@example.com','secret-token-123','private-secret-123','hunter2','abcdef'])expect(safe).not.toContain(secret)
    expect(safe).toContain('[USER]');expect(safe).toContain('[EMAIL]')
  })
  it('preserves diagnostic versions and error codes',()=>{
    expect(redact('Firefox 159.0 Windows 10.0.26100 error 0x80070005')).toBe('Firefox 159.0 Windows 10.0.26100 error 0x80070005')
  })
})
