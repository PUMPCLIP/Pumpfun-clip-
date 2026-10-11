'use client';

import {createContext,useContext} from 'react';

type PrivyConfigState={appId:string|null;ready:boolean};
const PrivyConfigContext=createContext<PrivyConfigState>({appId:null,ready:false});

export function usePrivyConfig(){return useContext(PrivyConfigContext);}
export default PrivyConfigContext;
