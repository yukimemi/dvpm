function! health#dvpm#check() abort
  if has('nvim')
    lua require("health.dvpm").check()
  else
    echoerr "Dvpm health check is only supported in Neovim."
  endif
endfunction
