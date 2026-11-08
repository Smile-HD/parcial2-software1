/**
 * Nodo de clase UML renderizado dentro de un lienzo de React Flow.
 * Ensambla los subcomponentes ClassNodeHeader, ClassNodeAttributes, ClassNodeMethods y ClassNodeHandles.
 */
import { useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { Attribute, ClassKind, Method, Parameter, Visibility } from '@app/core';
import { ClassNodeHeader } from './components/ClassNodeHeader';
import { ClassNodeAttributes, renderAttribute } from './components/ClassNodeAttributes';
import { ClassNodeMethods, renderMethod, parseParameters } from './components/ClassNodeMethods';
import { ClassNodeHandles } from './components/ClassNodeHandles';

export { renderAttribute, renderMethod, parseParameters };

export interface MemberAdornments {
  visibility?: Visibility;
  isStatic?: boolean;
  isDerived?: boolean;
  multiplicity?: string;
}

export type ClassNodeData = Record<string, unknown> & {
  name: string;
  attributes: readonly Attribute[];
  methods: readonly Method[];
  kind: ClassKind;
  isAbstract: boolean;
  otherClasses: readonly { id: string; name: string }[];
  otherInterfaces: readonly { id: string; name: string }[];
  onRename: (newName: string) => void;
  onDelete: () => void;
  onAddAttribute: (name: string, type: string, adornments?: MemberAdornments) => void;
  onEditAttribute: (memberId: string, name: string, type: string, adornments?: MemberAdornments) => void;
  onRemoveAttribute: (memberId: string) => void;
  onAddMethod: (name: string, returnType: string, parameters: Parameter[], adornments?: MemberAdornments) => void;
  onEditMethod: (memberId: string, name: string, returnType: string, parameters: Parameter[], adornments?: MemberAdornments) => void;
  onRemoveMethod: (memberId: string) => void;
  onMakeSubclass: (superClassId: string) => void;
  onToggleAbstract: (isAbstract: boolean) => void;
  onRealize: (supplierInterfaceId: string) => void;
  onDependOn: (supplierClassId: string) => void;
  onSelect: () => void;
  connectArmed?: boolean;
  selected?: boolean;
  onQuickLinkStart?: (clientX: number, clientY: number) => void;
  remoteSelection?: { name: string; color: string };
};

export type ClassFlowNode = import('@xyflow/react').Node<ClassNodeData, 'class'>;

export function ClassNode({ data }: NodeProps<ClassFlowNode>) {
  const [menuOpen, setMenuOpen] = useState(false);

  const isInterface = data.kind === 'interface';
  const isItalicName = isInterface || data.isAbstract;
  const remoteSelection = data.remoteSelection as { name: string; color: string } | undefined;

  return (
    <div
      className={`uml-class${isInterface ? ' uml-class--interface' : ''}${data.selected === true ? ' uml-class--selected' : ''}`}
      style={
        remoteSelection
          ? {
              outline: `2px solid ${remoteSelection.color}`,
              outlineOffset: '2px',
              boxShadow: `0 0 10px ${remoteSelection.color}55`,
            }
          : undefined
      }
      onClick={data.onSelect}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen(true);
      }}
    >
      <ClassNodeHeader
        data={data}
        isInterface={isInterface}
        isItalicName={isItalicName}
        remoteSelection={remoteSelection}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />

      <ClassNodeAttributes data={data} />

      <ClassNodeMethods data={data} />

      <ClassNodeHandles connectArmed={data.connectArmed} />
    </div>
  );
}
