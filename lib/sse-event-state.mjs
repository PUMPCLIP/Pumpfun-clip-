export function acceptsEventId(lastEventId,candidate){
  if(/^\d+$/.test(candidate)&&/^\d+$/.test(lastEventId)&&lastEventId&&BigInt(candidate)<=BigInt(lastEventId))return false;
  return true;
}
