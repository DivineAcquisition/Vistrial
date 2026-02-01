"use client"

import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/Dropdown"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import { Tooltip } from "@/components/Tooltip"
import { ModalAddUser } from "@/components/ui/settings/ModalAddUser"
import { invitedUsers, roles, users } from "@/data/data"
import { RiAddLine, RiMore2Fill, RiTeamLine, RiTimeLine } from "@remixicon/react"

export default function Users() {
  return (
    <>
      {/* Existing Users Section */}
      <div className="relative">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/10 via-brand-600/10 to-indigo-500/10 rounded-2xl blur opacity-50" />
        <Card className="relative">
          {/* Top accent line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />
          
          <section aria-labelledby="existing-users">
            <div className="sm:flex sm:items-center sm:justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400/20 to-brand-600/20">
                  <RiTeamLine className="h-5 w-5 text-brand-400" />
                </div>
                <div>
                  <h3
                    id="existing-users"
                    className="scroll-mt-10 font-semibold text-white"
                  >
                    Users
                  </h3>
                  <p className="text-sm text-gray-400">
                    Workspace administrators can add, manage, and remove users.
                  </p>
                </div>
              </div>
              <ModalAddUser>
                <Button className="mt-4 w-full gap-2 sm:mt-0 sm:w-fit">
                  <RiAddLine className="-ml-1 size-4 shrink-0" aria-hidden="true" />
                  Add user
                </Button>
              </ModalAddUser>
            </div>
            <ul
              role="list"
              className="divide-y divide-white/10"
            >
              {users.map((user) => (
                <li
                  key={user.name}
                  className="flex items-center justify-between gap-x-6 py-4"
                >
                  <div className="flex items-center gap-x-4 truncate">
                    <span
                      className="hidden size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm text-gray-300 sm:flex"
                      aria-hidden="true"
                    >
                      {user.initials}
                    </span>
                    <div className="truncate">
                      <p className="truncate text-sm font-medium text-white">
                        {user.name}
                      </p>
                      <p className="truncate text-xs text-gray-500">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {user.role === "admin" ? (
                      <Tooltip
                        content="A workspace must have at least one admin"
                        className="max-w-44 text-xs"
                        sideOffset={5}
                        triggerAsChild={true}
                      >
                        <div>
                          <Select
                            defaultValue={user.role}
                            disabled={user.role === "admin"}
                          >
                            <SelectTrigger className="h-8 w-32">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent align="end">
                              {roles.map((role) => (
                                <SelectItem
                                  key={role.value}
                                  value={role.value}
                                  disabled={role.value === "admin"}
                                >
                                  {role.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </Tooltip>
                    ) : (
                      <Select
                        defaultValue={user.role}
                        disabled={user.role === "admin"}
                      >
                        <SelectTrigger className="h-8 w-32">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent align="end">
                          {roles.map((role) => (
                            <SelectItem
                              key={role.value}
                              value={role.value}
                              disabled={role.value === "admin"}
                            >
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className="group size-8 hover:bg-white/10"
                        >
                          <RiMore2Fill
                            className="size-4 shrink-0 text-gray-500 group-hover:text-gray-300"
                            aria-hidden="true"
                          />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem disabled={user.role === "admin"}>
                          View details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-400"
                          disabled={user.role === "admin"}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </Card>
      </div>

      {/* Pending Invitations Section */}
      <div className="relative mt-6">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500/10 via-amber-600/10 to-orange-500/10 rounded-2xl blur opacity-50" />
        <Card className="relative">
          <section aria-labelledby="pending-invitations">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400/20 to-amber-600/20">
                <RiTimeLine className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <h2
                  id="pending-invitations"
                  className="scroll-mt-10 font-semibold text-white"
                >
                  Pending invitations
                </h2>
                <p className="text-sm text-gray-400">
                  Users who have been invited but haven&apos;t joined yet.
                </p>
              </div>
            </div>
            <ul
              role="list"
              className="divide-y divide-white/10"
            >
              {invitedUsers.map((user) => (
                <li
                  key={user.initials}
                  className="flex items-center justify-between gap-x-6 py-4"
                >
                  <div className="flex items-center gap-x-4">
                    <span
                      className="hidden size-10 shrink-0 items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/5 text-sm text-gray-400 sm:flex"
                      aria-hidden="true"
                    >
                      {user.initials}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {user.email}
                      </p>
                      <p className="text-xs text-gray-500">
                        Expires in {user.expires} days
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select defaultValue={user.role}>
                      <SelectTrigger className="h-8 w-32">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent align="end">
                        {roles.map((role) => (
                          <SelectItem
                            key={role.value}
                            value={role.value}
                            disabled={role.value === "admin"}
                          >
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className="group size-8 hover:bg-white/10"
                        >
                          <RiMore2Fill
                            className="size-4 shrink-0 text-gray-500 group-hover:text-gray-300"
                            aria-hidden="true"
                          />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem
                          className="text-red-400"
                          disabled={user.role === "admin"}
                        >
                          Revoke invitation
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </Card>
      </div>
    </>
  )
}
