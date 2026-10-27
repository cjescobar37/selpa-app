'use client'
import {useCallback,useEffect,useRef} from 'react'
import {useRouter} from 'next/navigation'

/** A same-URL history entry lets iOS Back ask before Next unmounts the editor. */
export function useUnsavedProfileGuard(dirty:boolean) {
  const router=useRouter()
  const allowed=useRef(false)
  const guard=useRef<{active:boolean;key:string;afterPop:(()=>void)|null}>({active:false,key:'',afterPop:null})
  const ask=useCallback(()=>{
    if(!dirty || allowed.current)return true
    const accept=window.confirm('Tenés cambios sin guardar. ¿Querés salir de la edición y descartarlos?')
    if(accept)allowed.current=true
    return accept
  },[dirty])
  const navigate=useCallback((href:string)=>{
    if(!ask())return
    const url=new URL(href,window.location.href)
    const go=()=>url.origin===window.location.origin?router.push(url.pathname+url.search+url.hash):window.location.assign(url.href)
    if(guard.current.active && window.history.state?.__selpaProfileEdit===guard.current.key){
      guard.current.afterPop=go
      window.history.back()
    }else go()
  },[ask,router])
  useEffect(()=>{
    if(!dirty){
      allowed.current=false
      if(guard.current.active && window.history.state?.__selpaProfileEdit===guard.current.key){guard.current.active=false;window.history.back()}
      return
    }
    const formUrl=window.location.href,formState=window.history.state
    const key=Date.now().toString(36)+Math.random().toString(36).slice(2)
    const install=()=>{guard.current.active=true;guard.current.key=key;window.history.pushState({...formState,__selpaProfileEdit:key},'',formUrl)}
    if(!guard.current.active)install()
    const beforeUnload=(event:BeforeUnloadEvent)=>{if(!allowed.current){event.preventDefault();event.returnValue=''}}
    const click=(event:MouseEvent)=>{
      if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return
      const target=event.target instanceof Element?event.target:null
      if(target?.closest('.px-ddItem--danger')){if(!ask()){event.preventDefault();event.stopImmediatePropagation()}return}
      const link=target?.closest('a[href]')
      if(!(link instanceof HTMLAnchorElement)||link.target==='_blank'||link.hasAttribute('download')||link.href===formUrl||link.getAttribute('href')?.startsWith('#'))return
      event.preventDefault();event.stopImmediatePropagation();navigate(link.href)
    }
    const pop=(event:PopStateEvent)=>{
      if(guard.current.afterPop){const go=guard.current.afterPop;guard.current.afterPop=null;guard.current.active=false;queueMicrotask(go);return}
      if(!guard.current.active||allowed.current)return
      guard.current.active=false
      if(ask()){window.history.back();return}
      event.stopImmediatePropagation();install()
    }
    window.addEventListener('beforeunload',beforeUnload)
    document.addEventListener('click',click,true)
    window.addEventListener('popstate',pop,true)
    return ()=>{window.removeEventListener('beforeunload',beforeUnload);document.removeEventListener('click',click,true);window.removeEventListener('popstate',pop,true)}
  },[ask,dirty,navigate])
  return navigate
}
